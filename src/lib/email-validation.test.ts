import { describe, it, expect } from 'vitest';
import { validateEmail } from './email-validation';

describe('validateEmail', () => {
  describe('formato sintáctico', () => {
    it('acepta un correo con formato válido', () => {
      expect(validateEmail('user@example.org')).toEqual({ valid: true });
    });

    it('recorta espacios en blanco antes de validar', () => {
      expect(validateEmail('  user@example.org  ')).toEqual({ valid: true });
    });

    it.each([
      ['cadena vacía', ''],
      ['solo espacios', '   '],
      ['sin arroba', 'plain-address'],
      ['sin parte local', '@example.org'],
      ['sin dominio', 'user@'],
      ['dominio sin punto (TLD)', 'user@localhost'],
      ['dominio sin TLD', 'user@example'],
      ['espacio en la parte local', 'user name@example.org'],
      ['espacio en el dominio', 'user@exam ple.org'],
      ['dominio que empieza por punto', 'user@.com'],
      ['arrobas duplicados', 'user@@example.org'],
    ])('rechaza %s', (_label, email) => {
      expect(validateEmail(email)).toEqual({
        valid: false,
        reason: 'Formato de correo inválido.',
      });
    });
  });

  describe('longitud máxima (254 caracteres)', () => {
    it('rechaza un correo de más de 254 caracteres', () => {
      const email = `${'a'.repeat(250)}@b.co`; // 255 caracteres
      expect(email.length).toBeGreaterThan(254);
      expect(validateEmail(email)).toEqual({
        valid: false,
        reason: 'El correo es demasiado largo.',
      });
    });

    it('acepta un correo de exactamente 254 caracteres', () => {
      const email = `${'a'.repeat(249)}@b.co`; // 254 caracteres
      expect(email.length).toBe(254);
      expect(validateEmail(email)).toEqual({ valid: true });
    });

    it('mide la longitud ya recortada', () => {
      const email = `${'a'.repeat(249)}@b.co`;
      expect(validateEmail(`   ${email}   `)).toEqual({ valid: true });
    });
  });

  describe('whitelist de dominios corporativos conocidos', () => {
    it.each([
      'user@gmail.com',
      'user@outlook.com',
      'user@hotmail.com',
      'user@proton.me',
      'user@icloud.com',
      'user@fastmail.com',
    ])('acepta %s sin más verificaciones', (email) => {
      expect(validateEmail(email)).toEqual({ valid: true });
    });

    it('es insensible a mayúsculas en el dominio', () => {
      expect(validateEmail('USER@GMAIL.COM')).toEqual({ valid: true });
      expect(validateEmail('User@Outlook.com')).toEqual({ valid: true });
    });

    it('tiene prioridad sobre los patrones de spam', () => {
      expect(validateEmail('test@gmail.com')).toEqual({ valid: true });
      expect(validateEmail('noreply@outlook.com')).toEqual({ valid: true });
    });
  });

  describe('dominios desechables / temporales', () => {
    it.each([
      'user@mailinator.com',
      'user@10minutemail.com',
      'user@0-mail.com',
      'user@maildrop.cc',
      'user@mailinator.org',
    ])('rechaza %s', (email) => {
      expect(validateEmail(email)).toEqual({
        valid: false,
        reason: 'No se permiten correos temporales o desechables.',
        suggestion: 'Usa tu correo corporativo o personal (Gmail, Outlook, etc.).',
      });
    });

    it('es insensible a mayúsculas en el dominio desechable', () => {
      expect(validateEmail('User@Mailinator.COM')).toEqual({
        valid: false,
        reason: 'No se permiten correos temporales o desechables.',
        suggestion: 'Usa tu correo corporativo o personal (Gmail, Outlook, etc.).',
      });
    });

    it('tiene prioridad sobre los patrones de spam', () => {
      expect(validateEmail('spam@mailinator.com').reason).toBe(
        'No se permiten correos temporales o desechables.',
      );
    });
  });

  describe('patrones de spam en la parte local', () => {
    it.each([
      ['test', 'test@site.org'],
      ['testing', 'testing@site.org'],
      ['spam', 'spam@site.org'],
      ['spammer', 'spammer@site.org'],
      ['fuckyou', 'fuckyou@site.org'],
      ['shit', 'shit@site.org'],
      ['noreply', 'noreply@site.org'],
      ['no-reply', 'no-reply@site.org'],
      ['no.reply', 'no.reply@site.org'],
      ['mailer-daemon', 'mailer-daemon@site.org'],
      ['mailer.daemon', 'mailer.daemon@site.org'],
    ])('rechaza la parte local %s', (_label, email) => {
      expect(validateEmail(email)).toEqual({
        valid: false,
        reason: 'Este correo parece ser de spam o prueba.',
      });
    });

    it('es insensible a mayúsculas', () => {
      expect(validateEmail('TEST@site.org').reason).toBe(
        'Este correo parece ser de spam o prueba.',
      );
      expect(validateEmail('NOREPLY@site.org').valid).toBe(false);
    });

    it('tiene prioridad sobre la comprobación de TLD sospechoso', () => {
      expect(validateEmail('test@site.tk').reason).toBe(
        'Este correo parece ser de spam o prueba.',
      );
    });
  });

  describe('TLDs sospechosos (Freenom)', () => {
    it.each(['.tk', '.cf', '.ga', '.gq', '.ml'])(
      'rechaza dominios con el TLD %s',
      (tld) => {
        expect(validateEmail(`user@site${tld}`)).toEqual({
          valid: false,
          reason: `No se permiten correos con dominio ${tld} por ser de alto riesgo.`,
          suggestion: 'Usa un correo corporativo o de un proveedor reconocido.',
        });
      },
    );

    it('es insensible a mayúsculas en el TLD', () => {
      expect(validateEmail('user@SITE.TK')).toEqual({
        valid: false,
        reason: 'No se permiten correos con dominio .tk por ser de alto riesgo.',
        suggestion: 'Usa un correo corporativo o de un proveedor reconocido.',
      });
    });
  });

  describe('correos válidos de extremo a extremo', () => {
    it.each([
      'sofia@empresa.com',
      'contacto@my-startup.io',
      'a@b.co',
      'nombre.apellido@subdominio.empresa.com.mx',
    ])('acepta %s', (email) => {
      expect(validateEmail(email)).toEqual({ valid: true });
    });
  });
});
