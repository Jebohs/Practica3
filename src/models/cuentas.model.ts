
import { ObjectId } from "mongodb";

export type TipoCuenta = "corriente" | "ahorro";
export type EstadoCuenta = "activa" | "bloqueada" | "cerrada"

export interface CuentasT {
    _id?: ObjectId;
    iban: string;
    clienteId: ObjectId;
    tipo: TipoCuenta;
    saldo: number;
    descubiertoMax: number;
    estado: EstadoCuenta;
    creadoEn: Date;
}