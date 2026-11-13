
import { ObjectId } from "mongodb";
import type { Collection, Db, Filter } from "mongodb";
import type { Request, Response } from "express";

import type { CuentasT } from "../models/cuentas.model.js";
import type { ClienteT } from "../models/clientes.model.js";
import type { MovimientoT } from "../models/movimientos.model.js";

import { generarIBAN } from "../utils/iban.js";

// Colecciones de MongoDB
let cuentas: Collection<CuentasT>;
let clientes: Collection<ClienteT>;
let movimientos: Collection<MovimientoT>;
let db: Db;

// Configurar las colecciones desde index.ts
export const configCuentasCollections = (
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

// Funciones auxiliares
const responderError = (
    res: Response,
    status: number,
    mensaje: string
) => {
    return res.status(status).json({ error: mensaje });
};

const idValido = (id: unknown): id is string => {
    return typeof id === "string" &&
        /^[a-fA-F0-9]{24}$/.test(id);
};

const importeValido = (importe: unknown): importe is number => {
    return typeof importe === "number" &&
        Number.isSafeInteger(importe) &&
        importe > 0;
};

const categoriaValida = (categoria: unknown): categoria is string => {
    return typeof categoria === "string" &&
        categoria.trim().length > 0;
};

const paginacionValida = (
    pagina: number,
    limite: number
): boolean => {
    return Number.isInteger(pagina) &&
        pagina >= 1 &&
        Number.isInteger(limite) &&
        limite >= 1 &&
        limite <= 100;
};

const inicioDia = (): Date => {
    const fecha = new Date();
    fecha.setHours(0, 0, 0, 0);
    return fecha;
};

const esDuplicado = (err: unknown): boolean => {
    return typeof err === "object" &&
        err !== null &&
        "code" in err &&
        err.code === 11000;
};

// POST /cuentas

export const crearCuenta = async (req: Request, res: Response) => {
    try {
        const { clienteId, tipo } = req.body;

        if (!idValido(clienteId)) {
            return responderError(res, 400, "El ID del cliente no es válido.");
        }

        if (tipo !== "corriente" && tipo !== "ahorro") {
            return responderError(res, 400, "El tipo debe ser corriente o ahorro.");
        }

        // Comprobar que existe el cliente
        const cliente = await clientes.findOne({
            _id: new ObjectId(clienteId)
        });

        if (!cliente) {
            return responderError(res, 404, "Cliente no encontrado.");
        }

        // Comprobar el número de cuentas abiertas
        const numeroCuentas = await cuentas.countDocuments({
            clienteId: new ObjectId(clienteId),
            estado: { $ne: "cerrada" }
        });

        if (numeroCuentas >= 3) {
            return responderError(
                res,
                409,
                "El cliente ya tiene el máximo de 3 cuentas abiertas."
            );
        }

        // Intentar generar un IBAN único
        for (let intento = 0; intento < 10; intento++) {
            const nuevaCuenta: CuentasT = {
                iban: generarIBAN(),
                clienteId: new ObjectId(clienteId),
                tipo,
                saldo: 0,
                descubiertoMax: tipo === "corriente" ? 50000 : 0,
                estado: "activa",
                creadoEn: new Date()
            };

            try {
                const resultado = await cuentas.insertOne(nuevaCuenta);

                return res.status(201).json({
                    ...nuevaCuenta,
                    _id: resultado.insertedId.toString(),
                    cliente: {
                        nombre: cliente.nombre,
                        email: cliente.email
                    }
                });
            } catch (err) {
                if (!esDuplicado(err)) {
                    throw err;
                }
            }
        }

        return responderError(res, 500, "No se ha podido generar un IBAN único.");

    } catch (err) {
        console.error(err);
        return responderError(res, 500, "Error al crear la cuenta.");
    }
};

// --------------------------------------------------
// LISTAR CUENTAS
// GET /cuentas
// --------------------------------------------------

export const listarCuentas = async (req: Request, res: Response) => {
    try {
        const pagina = Number(req.query.pagina ?? 1);
        const limite = Number(req.query.limite ?? 20);

        if (!paginacionValida(pagina, limite)) {
            return responderError(res, 400, "Los parámetros de paginación no son válidos.");
        }

        const filtro: Filter<CuentasT> = {};

        // Filtrar por cliente
        if (req.query.clienteId !== undefined) {
            if (!idValido(req.query.clienteId)) {
                return responderError(res, 400, "El ID del cliente no es válido.");
            }

            filtro.clienteId = new ObjectId(req.query.clienteId);
        }

        // Filtrar por tipo
        if (req.query.tipo !== undefined) {
            if (
                req.query.tipo !== "corriente" &&
                req.query.tipo !== "ahorro"
            ) {
                return responderError(res, 400, "El tipo de cuenta no es válido.");
            }

            filtro.tipo = req.query.tipo;
        }

        // Filtrar por estado
        if (req.query.estado !== undefined) {
            const estados = ["activa", "bloqueada", "cerrada"];

            if (
                typeof req.query.estado !== "string" ||
                !estados.includes(req.query.estado)
            ) {
                return responderError(res, 400, "El estado no es válido.");
            }

            filtro.estado = req.query.estado as CuentasT["estado"];
        }

        const total = await cuentas.countDocuments(filtro);

        const resultado = await cuentas.find(filtro)
            .sort({ creadaEn: -1 })
            .skip((pagina - 1) * limite)
            .limit(limite)
            .toArray();

        return res.json({
            datos: resultado.map(cuenta => ({
                ...cuenta,
                _id: cuenta._id?.toString(),
                clienteId: cuenta.clienteId.toString()
            })),
            pagina,
            limite,
            total,
            totalPaginas: Math.ceil(total / limite)
        });

    } catch (err) {
        console.error(err);
        return responderError(res, 500, "Error al listar las cuentas.");
    }
};

// --------------------------------------------------
// OBTENER UNA CUENTA
// GET /cuentas/:id
// --------------------------------------------------

export const obtenerCuenta = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;

        if (!idValido(id)) {
            return responderError(res, 400, "El ID de la cuenta no es válido.");
        }

        const cuenta = await cuentas.findOne({
            _id: new ObjectId(id)
        });

        if (!cuenta) {
            return responderError(res, 404, "Cuenta no encontrada.");
        }

        const cliente = await clientes.findOne({
            _id: cuenta.clienteId
        });

        if (!cliente) {
            return responderError(res, 404, "Titular de la cuenta no encontrado.");
        }

        return res.json({
            ...cuenta,
            _id: cuenta._id?.toString(),
            clienteId: cuenta.clienteId.toString(),
            titular: {
                nombre: cliente.nombre,
                email: cliente.email
            }
        });

    } catch (err) {
        console.error(err);
        return responderError(res, 500, "Error al obtener la cuenta.");
    }
};

// --------------------------------------------------
// CAMBIAR ESTADO DE UNA CUENTA
// PATCH /cuentas/:id/estado
// --------------------------------------------------

export const cambiarEstadoCuenta = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const estadoSolicitado: CuentasT["estado"] = req.body.estado;

        if (!idValido(id)) {
            return responderError(res, 400, "El ID de la cuenta no es válido.");
        }

        const estados = ["activa", "bloqueada", "cerrada"];

        if (
            typeof estadoSolicitado !== "string" ||
            !estados.includes(estadoSolicitado)
        ) {
            return responderError(res, 400, "El estado solicitado no es válido.");
        }

        const cuenta = await cuentas.findOne({
            _id: new ObjectId(id)
        });

        if (!cuenta) {
            return responderError(res, 404, "Cuenta no encontrada.");
        }

        // Transiciones permitidas
        const transiciones: Record<CuentasT["estado"], string[]> = {
            activa: ["bloqueada", "cerrada"],
            bloqueada: ["activa", "cerrada"],
            cerrada: []
        };

        if (!transiciones[cuenta.estado].includes(estadoSolicitado)) {
            return res.status(409).json({
                error: "Transición de estado no permitida.",
                actual: cuenta.estado,
                solicitado: estadoSolicitado
            });
        }

        // Para cerrar una cuenta, el saldo debe ser cero
        if (estadoSolicitado === "cerrada" && cuenta.saldo !== 0) {
            return responderError(
                res,
                409,
                "No se puede cerrar una cuenta cuyo saldo no sea cero."
            );
        }

        // Actualizar comprobando que no haya cambiado entretanto
        const resultado = await cuentas.updateOne(
            {
                _id: new ObjectId(id),
                estado: cuenta.estado,
                ...(estadoSolicitado === "cerrada" ? { saldo: 0 } : {})
            },
            {
                $set: { estado: estadoSolicitado }
            }
        );

        if (resultado.modifiedCount !== 1) {
            return responderError(
                res,
                409,
                "La cuenta ha cambiado. Vuelve a consultar sus datos."
            );
        }

        return res.json({
            mensaje: "Estado actualizado correctamente.",
            estado: estadoSolicitado
        });

    } catch (err) {
        console.error(err);
        return responderError(res, 500, "Error al cambiar el estado de la cuenta.");
    }
};

// --------------------------------------------------
// LISTAR MOVIMIENTOS DE UNA CUENTA
// GET /cuentas/:id/movimientos
// --------------------------------------------------

export const listarMovimientos = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;

        if (!idValido(id)) {
            return responderError(res, 400, "El ID de la cuenta no es válido.");
        }

        const cuentaId = new ObjectId(id);

        const cuenta = await cuentas.findOne({ _id: cuentaId });

        if (!cuenta) {
            return responderError(res, 404, "Cuenta no encontrada.");
        }

        const pagina = Number(req.query.pagina ?? 1);
        const limite = Number(req.query.limite ?? 20);

        if (!paginacionValida(pagina, limite)) {
            return responderError(res, 400, "Los parámetros de paginación no son válidos.");
        }

        const filtro: Filter<MovimientoT> = { cuentaId };

        // Filtrar por uno o varios tipos separados por comas
        if (req.query.tipo !== undefined) {
            if (typeof req.query.tipo !== "string") {
                return responderError(res, 400, "El tipo de movimiento no es válido.");
            }

            const tipos = req.query.tipo.split(",");

            const tiposPermitidos = [
                "ingreso",
                "retirada",
                "transferencia_emitida",
                "transferencia_recibida",
                "comision"
            ];

            if (tipos.some(tipo => !tiposPermitidos.includes(tipo))) {
                return responderError(res, 400, "Tipo de movimiento no válido.");
            }

            filtro.tipo = {
                $in: tipos as MovimientoT["tipo"][]
            };
        }

        // Filtrar por categoría
        if (req.query.categoria !== undefined) {
            if (typeof req.query.categoria !== "string") {
                return responderError(res, 400, "La categoría no es válida.");
            }

            filtro.categoria = req.query.categoria;
        }

        // Filtrar por fechas
        if (
            req.query.desde !== undefined ||
            req.query.hasta !== undefined
        ) {
            const fechas: { $gte?: Date; $lte?: Date } = {};

            if (req.query.desde !== undefined) {
                if (typeof req.query.desde !== "string") {
                    return responderError(res, 400, "La fecha inicial no es válida.");
                }

                const desde = new Date(req.query.desde);

                if (Number.isNaN(desde.getTime())) {
                    return responderError(res, 400, "La fecha inicial no es válida.");
                }

                fechas.$gte = desde;
            }

            if (req.query.hasta !== undefined) {
                if (typeof req.query.hasta !== "string") {
                    return responderError(res, 400, "La fecha final no es válida.");
                }

                const hasta = new Date(req.query.hasta);

                if (Number.isNaN(hasta.getTime())) {
                    return responderError(res, 400, "La fecha final no es válida.");
                }

                fechas.$lte = hasta;
            }

            filtro.fecha = fechas;
        }

        // Orden cronológico
        let orden: 1 | -1 = -1;

        if (req.query.orden !== undefined) {
            if (
                req.query.orden !== "fecha" &&
                req.query.orden !== "-fecha"
            ) {
                return responderError(res, 400, "El orden debe ser fecha o -fecha.");
            }

            orden = req.query.orden === "fecha" ? 1 : -1;
        }

        const total = await movimientos.countDocuments(filtro);

        const resultado = await movimientos.find(filtro)
            .sort({ fecha: orden })
            .skip((pagina - 1) * limite)
            .limit(limite)
            .toArray();

        return res.json({
            datos: resultado.map(movimiento => ({
                ...movimiento,
                _id: movimiento._id?.toString(),
                cuentaId: movimiento.cuentaId.toString(),
                transferenciaId: movimiento.transferenciaId?.toString()
            })),
            pagina,
            limite,
            total,
            totalPaginas: Math.ceil(total / limite)
        });

    } catch (err) {
        console.error(err);
        return responderError(res, 500, "Error al listar los movimientos.");
    }
};

// --------------------------------------------------
// INGRESAR O RETIRAR DINERO
// --------------------------------------------------

const realizarOperacion = async (
    req: Request,
    res: Response,
    tipo: "ingreso" | "retirada"
) => {
    const session = db.client.startSession();

    try {
        const id = req.params.id;
        const { importe, concepto, categoria } = req.body;

        if (!idValido(id)) {
            return responderError(res, 400, "El ID de la cuenta no es válido.");
        }

        if (!importeValido(importe)) {
            return responderError(
                res,
                400,
                "El importe debe ser un entero positivo expresado en céntimos."
            );
        }

        if (typeof concepto !== "string" || concepto.trim() === "") {
            return responderError(res, 400, "El concepto es obligatorio.");
        }

        if (
            categoria !== undefined &&
            !categoriaValida(categoria)
        ) {
            return responderError(res, 400, "La categoría no es válida.");
        }

        let respuesta: {
            saldo: number;
            movimientoId: string;
        } | undefined;

        await session.withTransaction(async () => {
            const cuentaId = new ObjectId(id);

            const cuenta = await cuentas.findOne(
                { _id: cuentaId },
                { session }
            );

            if (!cuenta) {
                throw new Error("CUENTA_NO_EXISTE");
            }

            if (cuenta.estado === "cerrada") {
                throw new Error("CUENTA_CERRADA");
            }

            // Las retiradas solo se permiten en cuentas activas.
            // Los ingresos también se permiten en cuentas bloqueadas.
            if (tipo === "retirada" && cuenta.estado !== "activa") {
                throw new Error("CUENTA_NO_ACTIVA");
            }

            const nuevoSaldo = tipo === "ingreso"
                ? cuenta.saldo + importe
                : cuenta.saldo - importe;

            // Comprobar descubierto
            if (
                tipo === "retirada" &&
                nuevoSaldo < -cuenta.descubiertoMax
            ) {
                throw new Error("SALDO_INSUFICIENTE");
            }

            // Comprobar límite diario de retiradas
            if (tipo === "retirada") {
                const movimientosDiarios = await movimientos.aggregate<{
                    total: number;
                }>([
                    {
                        $match: {
                            cuentaId,
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

                if (gastado + importe > 100000) {
                    throw new Error("LIMITE_DIARIO");
                }
            }

            // Actualizar saldo
            const actualizacion = await cuentas.updateOne(
                {
                    _id: cuentaId,
                    saldo: cuenta.saldo,
                    estado: cuenta.estado
                },
                {
                    $set: { saldo: nuevoSaldo }
                },
                { session }
            );

            if (actualizacion.modifiedCount !== 1) {
                throw new Error("CONFLICTO_CUENTA");
            }

            // Crear movimiento
            const nuevoMovimiento: MovimientoT = {
                cuentaId,
                tipo,
                importe: tipo === "ingreso" ? importe : -importe,
                saldoResultante: nuevoSaldo,
                concepto: concepto.trim(),
                categoria: categoriaValida(categoria)
                    ? categoria.trim()
                    : "otros",
                fecha: new Date()
            };

            const insertado = await movimientos.insertOne(
                nuevoMovimiento,
                { session }
            );

            respuesta = {
                saldo: nuevoSaldo,
                movimientoId: insertado.insertedId.toString()
            };
        });

        return res.status(201).json({
            mensaje: tipo === "ingreso"
                ? "Ingreso realizado correctamente."
                : "Retirada realizada correctamente.",
            ...respuesta
        });

    } catch (err) {
        const mensaje = err instanceof Error ? err.message : "";

        const errores: Record<string, [number, string]> = {
            CUENTA_NO_EXISTE: [404, "Cuenta no encontrada."],
            CUENTA_CERRADA: [409, "La cuenta está cerrada."],
            CUENTA_NO_ACTIVA: [409, "La cuenta debe estar activa para retirar dinero."],
            SALDO_INSUFICIENTE: [409, "Saldo insuficiente."],
            LIMITE_DIARIO: [409, "Se ha superado el límite diario de 1000 euros."],
            CONFLICTO_CUENTA: [409, "La cuenta ha cambiado. Repite la operación."]
        };

        if (errores[mensaje]) {
            return responderError(
                res,
                errores[mensaje][0],
                errores[mensaje][1]
            );
        }

        console.error(err);
        return responderError(res, 500, "Error al realizar la operación.");

    } finally {
        await session.endSession();
    }
};

// POST /cuentas/:id/ingresos
export const ingresarDinero = (req: Request, res: Response) => {
    return realizarOperacion(req, res, "ingreso");
};

// POST /cuentas/:id/retiradas
export const retirarDinero = (req: Request, res: Response) => {
    return realizarOperacion(req, res, "retirada");
};