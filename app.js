
const { MongoClient } = require("mongodb");
const mqtt = require("mqtt");

// Configuración de HiveMQ
const MQTT_BROKER = "1e15940db22b48dc8d995825d549f7a5.s1.eu.hivemq.cloud";
const MQTT_PORT = 8883;
const MQTT_USER = "admin";
const MQTT_PASS = "Admin123";

// Configuración de MongoDB
const mongoUri = "mongodb+srv://Eskayser11:Eskayser11@eskayser.qw7be.mongodb.net/?retryWrites=true&w=majority&appName=Eskayser";

// Variables para control de reconexión
let mqttClient;
let mongoClient;
let changeStream;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Función para limpiar estados "puerta: true" al inicio
async function cleanInitialDoorStates() {
  try {
    const db = mongoClient.db("test");
    const collection = db.collection("fraccionamientos");
    
    const result = await collection.updateMany(
      { puerta: true },
      { $set: { puerta: false } }
    );
    
    console.log(`🧹 Limpieza inicial: ${result.modifiedCount} documentos actualizados (puerta -> false)`);
  } catch (err) {
    console.error("❌ Error en limpieza inicial:", err.message);
  }
}

// Función para conectar/reconectar MQTT
function connectMQTT() {
  mqttClient = mqtt.connect({
    host: MQTT_BROKER,
    port: MQTT_PORT,
    username: MQTT_USER,
    password: MQTT_PASS,
    protocol: "mqtts",
    reconnectPeriod: 5000,
  });

  mqttClient.on("connect", () => {
    console.log("✅ Conectado a HiveMQ");
    reconnectAttempts = 0;
  });

  mqttClient.on("error", (err) => {
    console.error("❌ Error MQTT:", err.message);
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log(`🔄 Intento ${reconnectAttempts} de reconexión...`);
    } else {
      console.error("🔥 Máximos intentos alcanzados. Reiniciando cliente MQTT...");
      mqttClient.end();
      setTimeout(connectMQTT, 10000);
    }
  });
}

// Función para conectar MongoDB y escuchar cambios
async function connectMongoDB() {
  try {
    mongoClient = new MongoClient(mongoUri, {
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 30000,
    });

    await mongoClient.connect();
    console.log("✅ Conectado a MongoDB");

    // Ejecutar limpieza inicial
    await cleanInitialDoorStates();

    const db = mongoClient.db("test");
    const collection = db.collection("fraccionamientos");

    changeStream = collection.watch([], { fullDocument: "updateLookup" });

    changeStream.on("change", async (change) => {
      const documentId = change.documentKey._id;
      if (change.updateDescription?.updatedFields?.puerta === true) {
        console.log("🔔 Cambio detectado (puerta=true):", documentId);

        if (mqttClient.connected) {
          mqttClient.publish(
            `cotchico/accionar/id/${documentId}`,
            "RELAY",
            { qos: 1 },
            (err) => {
              if (err) console.error("Error al publicar:", err);
              else console.log("📤 Mensaje MQTT enviado");
            }
          );
        } else {
          console.warn("⚠️ MQTT no conectado. Mensaje no enviado.");
        }

        await collection.updateOne(
          { _id: documentId },
          { $set: { puerta: false } }
        );
        console.log("🔄 Puerta restablecida a false");
      }
    });

    changeStream.on("error", async (err) => {
      console.error("❌ Error en ChangeStream:", err.message);
      await restartMongoConnection();
    });

  } catch (err) {
    console.error("❌ Error en MongoDB:", err.message);
    await restartMongoConnection();
  }
}

// Reconexión de MongoDB
async function restartMongoConnection() {
  if (changeStream) changeStream.close();
  if (mongoClient) await mongoClient.close();
  console.log("🔄 Reconectando a MongoDB en 5 segundos...");
  setTimeout(connectMongoDB, 5000);
}

// Health Check
function startHealthCheck() {
  setInterval(() => {
    if (mqttClient.connected) {
      mqttClient.publish("cotchico/ping", "ping", { qos: 0 });
    } else {
      console.warn("⚠️ MQTT desconectado. Intentando reconectar...");
      connectMQTT();
    }
  }, 30000);
}

// Iniciar todo
async function startApp() {
  await connectMongoDB(); // Primero MongoDB para asegurar la limpieza inicial
  connectMQTT();
  startHealthCheck();
}

startApp();

// Manejar cierre limpio
process.on("SIGINT", async () => {
  console.log("🔴 Cerrando conexiones...");
  if (mqttClient) mqttClient.end();
  if (changeStream) changeStream.close();
  if (mongoClient) await mongoClient.close();
  process.exit();
});


