import { NextResponse } from 'next/server';
import { contactSchema } from '@/lib/validations/contact';
import { sendContactEmail } from '@/lib/services/emailService';
import { z } from 'zod';

export async function POST(req: Request) {
  try {
    // Verificar que el cuerpo sea JSON
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json(
        { error: 'Cuerpo de solicitud inválido' },
        { status: 400 }
      );
    }

    // Validar datos con Zod
    const validatedData = contactSchema.parse(body);

    // Intentamos procesar y enviar el correo
    await sendContactEmail(validatedData);

    return NextResponse.json(
      { success: true, message: 'Correo enviado a los consultores con éxito' },
      { status: 200 }
    );

  } catch (error: any) {
    // Manejo específico de errores de validación
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Datos de formulario inválidos', details: error.errors.map(e => e.message) },
        { status: 400 }
      );
    }

    // Logging estructurado sin exponer detalles sensibles al cliente
    console.error("[CONTACT_API_ERROR]", {
      message: error.message,
      stack: error.stack,
    });

    return NextResponse.json(
      { error: 'Error del servidor, no pudimos procesar el correo' },
      { status: 500 }
    );
  }
}
