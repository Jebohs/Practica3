
const convertirLetras = (texto: string): string => {
    return texto.replace(/[A-Z]/g, letra =>
        (letra.charCodeAt(0) - 55).toString()
    );
};

// Calcula el módulo 97 sin convertir el número completo a Number
const modulo97 = (numero: string): number => {
    let resto = 0;

    for (const digito of numero) {
        resto = (resto * 10 + Number(digito)) % 97;
    }

    return resto;
};

export const generarIBAN = (): string => {

    let bban = "";

    for (let i = 0; i < 20; i++) {
        bban += Math.floor(Math.random() * 10);
    }

    const cadena = convertirLetras(bban + "ES00");

    const control = (98 - modulo97(cadena))
        .toString()
        .padStart(2, "0");

    return "ES" + control + bban;
};

export const validarIBAN = (iban: string): boolean => {

    if (!/^ES\d{22}$/.test(iban)) {
        return false;
    }

    const reorganizado = iban.substring(4) + iban.substring(0, 4);

    const numero = convertirLetras(reorganizado);

    return modulo97(numero) === 1;
};
