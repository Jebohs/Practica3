import { Db, MongoClient } from "mongodb";

export const connectMongo = (): Promise<Db> => {
  const client = new MongoClient(process.env.MONGO_URI as string);

  return client.connect().then(() => {
    console.log("Conectado al Monguito");
    return client.db(process.env.DB_NAME);
  }).catch((error) => {
    console.log("Error al conectar con Mongo");
    throw error;
  });
};