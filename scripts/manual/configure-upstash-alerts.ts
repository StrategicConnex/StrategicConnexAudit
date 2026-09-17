import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const email = process.env.UPSTASH_EMAIL;
const apiKey = process.env.UPSTASH_API_KEY;
const databaseId = process.env.UPSTASH_REDIS_ID;

async function configureAlerts() {
  console.log("🚀 CONFIGURANDO ALERTAS DE SEGURIDAD EN UPSTASH...");

  if (!email || !apiKey || !databaseId) {
    console.error("❌ Faltan variables de entorno: UPSTASH_EMAIL, UPSTASH_API_KEY o UPSTASH_REDIS_ID");
    return;
  }

  const auth = Buffer.from(`${email}:${apiKey}`).toString('base64');

  // Definicin de la alerta: 1000 peticiones por minuto
  const alertPayload = {
    database_id: databaseId,
    type: "request_count",
    name: "Security: High Traffic Anomaly",
    threshold: 1000,
    period: "1m",
    rearm_period: "5m", // Esperar 5 min antes de volver a alertar
    notification_channels: ["email"] // Enva correo al dueo de la cuenta
  };

  try {
    const response = await fetch(`https://api.upstash.com/v1/redis/alert`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(alertPayload)
    });

    const data = await response.json();

    if (response.ok) {
      console.log("✅ ALERTA CONFIGURADA CON EXITO:");
      console.log(`   Nombre: ${alertPayload.name}`);
      console.log(`   Umbral: ${alertPayload.threshold} req / ${alertPayload.period}`);
    } else {
      console.error("❌ Error al configurar la alerta:", data);
    }
  } catch (error) {
    console.error("❌ Fallo en la conexin con la API de Upstash:", error);
  }
}

configureAlerts();
