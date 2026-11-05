
import { Router } from "express";

import {
    crearCuenta,
    listarCuentas,
    obtenerCuenta,
    cambiarEstadoCuenta,
    listarMovimientos,
    ingresarDinero,
    retirarDinero
} from "../controllers/cuentas.controller.js";

const router = Router();

router.post("/", crearCuenta);

router.get("/", listarCuentas);

router.get("/:id", obtenerCuenta);

router.patch("/:id/estado", cambiarEstadoCuenta);

router.get("/:id/movimientos", listarMovimientos);

// Ingresar dinero
router.post("/:id/ingresos", ingresarDinero);

// Retirar dinero
router.post("/:id/retiradas", retirarDinero);

export default router;
