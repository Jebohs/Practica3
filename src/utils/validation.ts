
import { ObjectId } from "mongodb";

export const esObjectIdValido = (id: string): boolean => {
    return /^[a-fA-F0-9]{24}$/.test(id);
};

export const importeValido = (importe: unknown): boolean => {
    return typeof importe === "number" &&
        Number.isSafeInteger(importe) &&
        importe > 0;
};

export const paginacion = (
    paginaParam: unknown,
    limiteParam: unknown
) => {

    const pagina = Number(paginaParam) || 1;
    const limite = Number(limiteParam) || 20;

    return {
        pagina: Math.max(1, Math.floor(pagina)),
        limite: Math.min(100, Math.max(1, Math.floor(limite)))
    };
};
