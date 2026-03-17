import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
  Req,
  Res,
  HttpCode,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyStatus, MerchantStatus } from '@prisma/client';

interface JwtUser {
  sub: string;
  role: string;
  phone?: string;
  companyId?: string;
  merchantId?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  private assertAdmin(req: { user: JwtUser }) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Accès réservé aux administrateurs Kado.');
    }
  }

  @Get('stats')
  getStats(@Req() req: { user: JwtUser }) {
    this.assertAdmin(req);
    return this.adminService.getStats();
  }

  @Get('companies')
  getCompanies(@Req() req: { user: JwtUser }) {
    this.assertAdmin(req);
    return this.adminService.getCompanies();
  }

  @Get('merchants')
  getMerchants(@Req() req: { user: JwtUser }) {
    this.assertAdmin(req);
    return this.adminService.getMerchants();
  }

  @Get('alerts')
  getAlerts(@Req() req: { user: JwtUser }) {
    this.assertAdmin(req);
    return this.adminService.getAlerts();
  }

  @Get('transactions')
  getRecentTransactions(@Req() req: { user: JwtUser }) {
    this.assertAdmin(req);
    return this.adminService.getRecentTransactions();
  }

  @Patch('companies/:id/status')
  updateCompanyStatus(
    @Req() req: { user: JwtUser },
    @Param('id') id: string,
    @Body('status') status: CompanyStatus,
  ) {
    this.assertAdmin(req);
    return this.adminService.updateCompanyStatus(id, status);
  }

  @Patch('merchants/:id/status')
  updateMerchantStatus(
    @Req() req: { user: JwtUser },
    @Param('id') id: string,
    @Body('status') status: MerchantStatus,
  ) {
    this.assertAdmin(req);
    return this.adminService.updateMerchantStatus(id, status);
  }

  // ─── Comptabilité ──────────────────────────────────────────────────────────

  @Get('ledger')
  getLedgerStats(@Req() req: { user: JwtUser }) {
    this.assertAdmin(req);
    return this.adminService.getLedgerStats();
  }

  @Get('ledger/export')
  async exportLedgerCsv(
    @Req() req: { user: JwtUser },
    @Res() res: Response,
  ) {
    this.assertAdmin(req);
    const csv = await this.adminService.getLedgerCsv();
    const filename = `grand-livre-kado-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM UTF-8 pour Excel
  }

  // ─── Webhooks ──────────────────────────────────────────────────────────────

  @Get('webhooks')
  getWebhookLogs(@Req() req: { user: JwtUser }) {
    this.assertAdmin(req);
    return this.adminService.getWebhookLogs();
  }

  @Post('webhooks/:id/retry')
  @HttpCode(200)
  retryWebhook(
    @Req() req: { user: JwtUser },
    @Param('id') id: string,
  ) {
    this.assertAdmin(req);
    return this.adminService.retryWebhook(id);
  }
}
