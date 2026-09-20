import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { NotificationCenter } from './NotificationCenter';
import {
  notify,
  getNotificationHistory,
  clearNotifications,
} from '@/shared/lib/notify';

// sonner toasts requieren DOM real del provider; en tests el toast.* es
// inocuo pero el registro en historial sí ocurre (comportamiento testeado).
beforeEach(() => {
  clearNotifications();
});

afterEach(() => {
  cleanup();
  clearNotifications();
});

describe('NotificationCenter', () => {
  it('muestra el estado vacío sin historial', () => {
    render(<NotificationCenter />);
    expect(screen.getByText('Sin notificaciones')).toBeInTheDocument();
  });

  it('lista notificaciones registradas con severidad y tiempo', () => {
    notify.info('Análisis completado');
    notify.error('Fallo de escaneo', 'Detalles del error');

    render(<NotificationCenter />);

    expect(screen.getByText('Análisis completado')).toBeInTheDocument();
    expect(screen.getByText('Fallo de escaneo')).toBeInTheDocument();
    expect(screen.getByText('Detalles del error')).toBeInTheDocument();
    // El contador sin leer aparece junto al título
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('marca todas como leídas al pulsar el botón', () => {
    notify.info('Evento A');
    notify.warning('Evento B');

    render(<NotificationCenter />);

    fireEvent.click(screen.getByLabelText('Marcar todas como leídas'));

    const history = getNotificationHistory();
    expect(history.every((n) => n.read)).toBe(true);
  });

  it('limpia el historial al pulsar la papelera', () => {
    notify.info('Evento temporal');

    render(<NotificationCenter />);

    fireEvent.click(screen.getByLabelText('Limpiar notificaciones'));

    expect(getNotificationHistory()).toHaveLength(0);
    expect(screen.getByText('Sin notificaciones')).toBeInTheDocument();
  });
});
