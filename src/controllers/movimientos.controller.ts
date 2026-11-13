
import { ObjectId } from "mongodb";
import type { Collection, Db } from "mongodb";
import type { Request, Response } from "express";

import type { CuentasT } from "../models/cuentas.model.js";
import type { ClienteT } from "../models/clientes.model.js";
import type { MovimientoT } from "../models/movimientos.model.js";

import { validarIBAN } from "../utils/iban.js";

let db: Db;
let cuentas: Collection<CuentasT>;
let clientes: Collection<ClienteT>;
let movimientos: Collection<MovimientoT>;

// Configurar colecciones
export const configTransferenciasCollections = (
    dbMongo: Db,
    cuentasCollection: Collection<CuentasT>,
    clientesCollection: Collection<ClienteT>,
    movimientosCollection: Collection<MovimientoT>
) => {
    db = dbMongo;
    cuentas = cuentasCollection;
    clientes = clientesCollection;
    movimientos = movimientosCollection;
};

const responderError = (
    res: Response,
    status: number,
    mensaje: string
) => {
    return res.status(status).json({ error: mensaje });
};

const importeValido = (importe: unknown): importe is number => {
    return typeof importe === "number" &&
        Number.isSafeInteger(importe) &&
        importe > 0;
};

const inicioDia = (): Date => {
    const fecha = new Date();
    fecha.setHours(0, 0, 0, 0);
    return fecha;
};

// POST /transferencias
export const realizarTransferencia = async (
    req: Request,
    res: Response
) => {
    const session = db.client.startSession();

    try {
        const {
            ibanOrigen,
            ibanDestino,
            importe,
            concepto,
            categoria
        } = req.body;

        // Validar IBAN
        if (
            typeof ibanOrigen !== "string" ||
            !validarIBAN(ibanOrigen) ||
            typeof ibanDestino !== "string" ||
            !validarIBAN(ibanDestino)
        ) {
            return responderError(res, 400, "Los IBAN no son válidos.");
        }

        if (ibanOrigen === ibanDestino) {
            return responderError(
                res,
                400,
                "Las cuentas de origen y destino deben ser distintas."
            );
        }

        // Validar importe
        if (!importeValido(importe)) {
            return responderError(
                res,
                400,
                "El importe debe ser un entero positivo en céntimos."
            );
        }

        // Validar concepto
        if (
            typeof concepto !== "string" ||
            concepto.trim() === ""
        ) {
            return responderError(res, 400, "El concepto es obligatorio.");
        }

        if (
            categoria !== undefined &&
            (typeof categoria !== "string" || categoria.trim() === "")
        ) {
            return responderError(res, 400, "La categoría no es válida.");
        }

        let respuesta: {
            transferenciaId: string;
            importe: number;
            comision: number;
            totalDebitado: number;
            saldoOrigen: number;
            saldoDestino: number;
        } | undefined;

        await session.withTransaction(async () => {

            // Buscar las cuentas
            const origen = await cuentas.findOne(
                { iban: ibanOrigen },
                { session }
            );

            const destino = await cuentas.findOne(
                { iban: ibanDestino },
                { session }
            );

            if (!origen || !destino) {
                throw new Error("CUENTA_NO_EXISTE");
            }

            // Comprobar estado de las cuentas
            if (origen.estado !== "activa") {
                throw new Error("ORIGEN_NO_ACTIVO");
            }

            if (destino.estado === "cerrada") {
                throw new Error("DESTINO_CERRADO");
            }

            // Buscar titulares
            const clienteOrigen = await clientes.findOne(
                { _id: origen.clienteId },
                { session }
            );

            const clienteDestino = await clientes.findOne(
                { _id: destino.clienteId },
                { session }
            );

            if (!clienteOrigen || !clienteDestino) {
                throw new Error("CLIENTE_NO_EXISTE");
            }

            // Calcular comisión
            const mismoTitular = origen.clienteId.equals(destino.clienteId);

            const comision = mismoTitular
                ? 0
                : Math.max(100, Math.ceil(importe * 0.005));

            const totalDebitado = importe + comision;

            // Calcular nuevos saldos
            const saldoOrigen = origen.saldo - totalDebitado;
            const saldoDestino = destino.saldo + importe;

            // Comprobar descubierto
            if (saldoOrigen < -origen.descubiertoMax) {
                throw new Error("SALDO_INSUFICIENTE");
            }

            // Comprobar límite diario de 1000 euros
            const movimientosDiarios = await movimientos.aggregate<{
                total: number;
            }>([
                {
                    $match: {
                        cuentaId: origen._id,
                        fecha: { $gte: inicioDia() },
                        tipo: {
                            $in: [
                                "retirada",
                                "transferencia_emitida",
                                "comision"
                            ]
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: {
                            $sum: { $abs: "$importe" }
                        }
                    }
                }
            ], { session }).toArray();

            const gastado = movimientosDiarios[0]?.total ?? 0;

            if (gastado + totalDebitado > 100000) {
                throw new Error("LIMITE_DIARIO");
            }

            // Actualizar saldo de origen
            const actualizacionOrigen = await cuentas.updateOne(
                {
                    _id: origen._id,
                    saldo: origen.saldo,
                    estado: "activa"
                },
                {
                    $set: { saldo: saldoOrigen }
                },
                { session }
            );

            // Actualizar saldo de destino
            const actualizacionDestino = await cuentas.updateOne(
                {
                    _id: destino._id,
                    saldo: destino.saldo,
                    estado: destino.estado
                },
                {
                    $set: { saldo: saldoDestino }
                },
                { session }
            );

            if (
                actualizacionOrigen.modifiedCount !== 1 ||
                actualizacionDestino.modifiedCount !== 1
            ) {
                throw new Error("CONFLICTO_CUENTA");
            }

            // Crear identificador común para los movimientos
            const transferenciaId = new ObjectId();
            const fecha = new Date();

            const categoriaFinal =
                typeof categoria === "string"
                    ? categoria.trim()
                    : "otros";

            // Movimiento de salida
            const movimientosNuevos: MovimientoT[] = [
                {
                    cuentaId: origen._id!,
                    tipo: "transferencia_emitida",
                    importe: -importe,
                    saldoResultante: origen.saldo - importe,
                    concepto: concepto.trim(),
                    categoria: categoriaFinal,
                    transferenciaId,
                    fecha
                },

                // Movimiento de entrada
                {
                    cuentaId: destino._id!,
                    tipo: "transferencia_recibida",
                    importe,
                    saldoResultante: saldoDestino,
                    concepto: concepto.trim(),
                    categoria: categoriaFinal,
                    transferenciaId,
                    fecha
                }
            ];

            // Movimiento de comisión, si corresponde
            if (comision > 0) {
                movimientosNuevos.push({
                    cuentaId: origen._id!,
                    tipo: "comision",
                    importe: -comision,
                    saldoResultante: saldoOrigen,
                    concepto: "Comisión por transferencia",
                    categoria: "comisiones",
                    transferenciaId,
                    fecha
                });
            }

            // Guardar todos los movimientos
            await movimientos.insertMany(
                movimientosNuevos,
                { session }
            );

            respuesta = {
                transferenciaId: transferenciaId.toString(),
                importe,
                comision,
                totalDebitado,
                saldoOrigen,
                saldoDestino
            };
        });

        return res.status(201).json({
            mensaje: "Transferencia realizada correctamente.",
            ...respuesta
        });

    } catch (err) {
        const mensaje = err instanceof Error ? err.message : "";

        const errores: Record<string, [number, string]> = {
            CUENTA_NO_EXISTE: [
                404,
                "Una de las cuentas no existe."
            ],
            ORIGEN_NO_ACTIVO: [
                409,
                "La cuenta de origen debe estar activa."
            ],
            DESTINO_CERRADO: [
                409,
                "La cuenta de destino está cerrada."
            ],
            CLIENTE_NO_EXISTE: [
                404,
                "No se ha encontrado el titular de una cuenta."
            ],
            SALDO_INSUFICIENTE: [
                409,
                "Saldo insuficiente para realizar la transferencia."
            ],
            LIMITE_DIARIO: [
                409,
                "Se ha superado el límite diario de 1000 euros."
            ],
            CONFLICTO_CUENTA: [
                409,
                "Una de las cuentas ha cambiado. Repite la operación."
            ]
        };

        if (errores[mensaje]) {
            return responderError(
                res,
                errores[mensaje][0],
                errores[mensaje][1]
            );
        }

        console.error(err);
        return responderError(res, 500, "Error al realizar la transferencia.");

    } finally {
        await session.endSession();
    }
};
