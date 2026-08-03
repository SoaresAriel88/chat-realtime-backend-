import { Test, TestingModule } from '@nestjs/testing';
import { MailQueueService } from './mail-queue.service';

describe('MailQueueService', () => {
  let service: MailQueueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MailQueueService],
    }).compile();

    service = module.get<MailQueueService>(MailQueueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
