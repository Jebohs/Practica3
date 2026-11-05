
import express from "express";

import {
    crearCliente,
    listarClientes,
    obtenerCliente,
    modificarCliente
} from "../controllers/clientes.controller.js";

const router = express.Router();

router.post("/", crearCliente);
router.get("/", listarClientes);
router.get("/:id", obtenerCliente);
router.patch("/:id", modificarCliente);

export default router;
