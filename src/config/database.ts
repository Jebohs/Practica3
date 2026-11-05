
import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB;

if (!uri || !dbName) {
    throw new Error("Faltan variables de entorno de MongoDB");
}

const client = new MongoClient(uri);

export const connectMongo = async (): Promise<Db> => {
    await client.connect();

    console.log("Conectado a MongoDB");

    return client.db(dbName);
};
