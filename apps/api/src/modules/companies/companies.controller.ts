import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CompaniesService, IssueVoucherDto, InviteCollaboratorDto } from './companies.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Get(':id/vouchers')
  findVouchers(@Param('id') id: string) {
    return this.companiesService.findVouchers(id);
  }

  @Post(':id/vouchers')
  issueVoucher(
    @Param('id') id: string,
    @Body() dto: IssueVoucherDto,
  ) {
    return this.companiesService.issueVoucher(id, dto);
  }

  @Post(':id/vouchers/import')
  @UseInterceptors(FileInterceptor('file'))
  importCsv(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.companiesService.importVouchersFromCsv(id, file.buffer.toString('utf-8'));
  }

  @Post(':id/invitations')
  inviteCollaborator(
    @Param('id') id: string,
    @Body() dto: InviteCollaboratorDto,
  ) {
    return this.companiesService.inviteCollaborator(id, dto);
  }

  @Get(':id/invitations')
  findInvitations(@Param('id') id: string) {
    return this.companiesService.findInvitations(id);
  }

  @Get(':id/impact')
  getImpact(@Param('id') id: string) {
    return this.companiesService.getImpact(id);
  }
}
