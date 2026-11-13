
import "dotenv/config";

import express from "express";

import { connectMongo } from "./config/database.js";

import clientesRoutes from "./routes/clientes.routes.js";

import { configClientesCollection } from "./controllers/clientes.controller.js";

import movimientosRoutes from "./routes/movimientos.routes.js";

import type { Collection } from "mongodb";
import type { ClienteT } from "./models/clientes.model.js";

const app = express();

app.use(express.json());


const startServer = async () => {
    try {
        const db = await connectMongo();

        const clientesCollection: Collection<ClienteT> =
            db.collection<ClienteT>("clientes");

        configClientesCollection(clientesCollection);

        app.use("/clientes", clientesRoutes);

        const port = Number(process.env.PORT) || 3001;

        app.listen(port, () => {
            console.log(`API funcionando en el puerto ${port}`);
        });

    } catch (error) {
        console.log("No se ha podido iniciar la API:", error);
        process.exit(1);
    }
};

startServer();