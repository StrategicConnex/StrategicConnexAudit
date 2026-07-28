import getTransporter from '../nodemailer';
import { ContactFormData } from '../validations/contact';

const escapeHTML = (str: string) => str.replace(/[&<>"']/g, (m) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[m] || m));

export async function sendContactEmail(data: ContactFormData) {
  const { name, company, email, message } = data;
  
  const safeName = escapeHTML(name);
  const safeCompany = escapeHTML(company);
  const safeEmail = escapeHTML(email);
  const safeMessage = escapeHTML(message);

  const mailOptions = {
    from: `"Plataforma Strategic" <${process.env.SMTP_USER}>`,
    to: process.env.CONTACT_EMAIL || process.env.SMTP_USER,
    replyTo: email,
    subject: `Nueva solicitud corporativa: ${name} de ${company}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; border: 1px solid #eaeaea; padding: 20px; border-radius: 8px;">
        <h2 style="color: #D4AF37; margin-top: 0;">Nuevo Contacto Web - Strategic Connex</h2>
        <p>Has recibido una nueva propuesta estratégica a través del formulario B2B:</p>
        <ul style="list-style: none; padding-left: 0; margin-bottom: 24px;">
          <li style="margin-bottom: 8px;"><strong>👤 Nombre:</strong> ${safeName}</li>
          <li style="margin-bottom: 8px;"><strong>🏢 Organización:</strong> ${safeCompany}</li>
          <li style="margin-bottom: 8px;"><strong>✉ Correo Técnico:</strong> <a href="mailto:${safeEmail}" style="color: #2563EB;">${safeEmail}</a></li>
        </ul>
        <h3 style="border-bottom: 2px solid #f0f0f0; padding-bottom: 10px; color: #333;">Detalle del Requerimiento</h3>
        <p style="background: #f9f9f9; padding: 20px; border-left: 6px solid #D4AF37; border-radius: 4px; color: #444; line-height: 1.5;">
          ${safeMessage}
        </p>
      </div>
    `,
  };

  return getTransporter().sendMail(mailOptions);
}
