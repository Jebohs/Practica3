
import { ObjectId } from "mongodb";
import type { Collection } from "mongodb";

import type { Request, Response } from "express";
import type { ClienteT } from "../models/clientes.model.js";

let clientesCollection: Collection<ClienteT>;

export const configClientesCollection = (
    collection: Collection<ClienteT>
) => {
    clientesCollection = collection;
};

// POST /clientes
export const crearCliente = async (req: Request, res: Response) => {
    try {
        const { nombre, email, dni } = req.body;

        if (!nombre || !email || !dni) {
            return res.status(400).json({
                error: "Nombre, email y DNI son obligatorios"
            });
        }

        const cliente: ClienteT = {
            nombre,
            email,
            dni,
            creadoEn: new Date()
        };

        const resultado = await clientesCollection.insertOne(cliente);

        return res.status(201).json({
            ...cliente,
            _id: resultado.insertedId.toString()
        });

    } catch (error) {
        return res.status(500).json({
            error: "Error al crear el cliente"
        });
    }
};

// GET /clientes
export const listarClientes = async (req: Request, res: Response) => {
    try {
        const pagina = Math.max(1, Number(req.query.pagina) || 1);
        const limite = Math.min(100, Math.max(1,
            Number(req.query.limite) || 10
        ));

        const clientes = await clientesCollection
            .find()
            .skip((pagina - 1) * limite)
            .limit(limite)
            .toArray();

        const total = await clientesCollection.countDocuments();

        return res.json({
            pagina,
            limite,
            total,
            clientes: clientes.map(cliente => ({
                ...cliente,
                _id: cliente._id!.toString()
            }))
        });

    } catch (error) {
        return res.status(500).json({
            error: "Error al listar clientes"
        });
    }
};

// GET /clientes/:id
export const obtenerCliente = async (req: Request, res: Response) => {
    try {

        const id = req.params.id;

    if (typeof id !== "string" || !/^[a-fA-F0-9]{24}$/.test(id)) {
        return res.status(400).json({
            error: "ID no válido"
        });
    }

        const cliente = await clientesCollection.findOne({
            _id: new ObjectId(id)
        });

        if (!cliente) {
            return res.status(404).json({
                error: "Cliente no encontrado"
            });
        }

        return res.json({
            ...cliente,
            _id: cliente._id!.toString()
        });

    } catch (error) {
        return res.status(500).json({
            error: "Error al obtener el cliente"
        });
    }
};

// PATCH /clientes/:id
export const modificarCliente = async (req: Request, res: Response) => {
    try {
        const { nombre, email } = req.body;
        const id = req.params.id;

        if (typeof id !== "string" || !/^[a-fA-F0-9]{24}$/.test(id)) {
            return res.status(400).json({
                error: "ID no válido"
            });
        }

        if (
            (nombre === undefined && email === undefined) ||
            (nombre !== undefined && (typeof nombre !== "string" || !nombre.trim())) ||
            (email !== undefined && (typeof email !== "string" || !email.trim()))
        ) {
            return res.status(400).json({
                error: "Debes proporcionar un nombre o email válido"
            });
        }

        const cambios: Partial<ClienteT> = {};

        if (nombre !== undefined) cambios.nombre = nombre.trim();
        if (email !== undefined) cambios.email = email.trim();

        const resultado = await clientesCollection.findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $set: cambios },
            { returnDocument: "after" }
        );

        if (!resultado) {
            return res.status(404).json({
                error: "Cliente no encontrado"
            });
        }

        return res.json({
            ...resultado,
            _id: resultado._id!.toString()
        });

    } catch (error) {
        return res.status(500).json({
            error: "Error al modificar el cliente"
        });
    }
};
