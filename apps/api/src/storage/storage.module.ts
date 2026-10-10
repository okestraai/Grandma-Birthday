import { Global, Module } from '@nestjs/common';
import { QuotaService } from './quota.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [StorageService, QuotaService],
  exports: [StorageService, QuotaService],
})
export class StorageModule {}
