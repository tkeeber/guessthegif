import { describe, it, expect } from 'vitest';
import { app } from './index';
import request from 'supertest';

describe('Server health check', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
