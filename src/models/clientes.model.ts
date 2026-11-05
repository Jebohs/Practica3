
import { ObjectId } from "mongodb";

export interface ClienteT {
    _id?: ObjectId;
    nombre: string;
    email: string;
    dni: string;
    creadoEn: Date;
}
