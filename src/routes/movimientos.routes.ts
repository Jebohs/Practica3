
import { Router } from "express";

import {
    listarMovimientos
} from "../controllers/cuentas.controller.js";

const router = Router();

// Consultar movimientos de una cuenta
router.get("/:id/movimientos", listarMovimientos);

export default router;
