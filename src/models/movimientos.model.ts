
import { ObjectId } from "mongodb";

export type TipoMovimiento =
    | "ingreso"
    | "retirada"
    | "transferencia_emitida"
    | "transferencia_recibida"
    | "comision";

export interface MovimientoT {
    _id?: ObjectId;
    cuentaId: ObjectId;
    tipo: TipoMovimiento;
    importe: number;
    saldoResultante: number;
    concepto: string;
    categoria: string;
    transferenciaId?: ObjectId;
    fecha: Date;
}
