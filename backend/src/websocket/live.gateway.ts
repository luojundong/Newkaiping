// 实时通道：WS /api/v1/ws/live（socket.io 命名空间）。
// 客户端 emit 'subscribe' 携带 {building_id, subsystem, device_ids}；服务端每 ~2s
// 推送 'metrics'(指标增量) 与 'alarms'(告警事件)。数据经 Connector 读取，来源可热切换。

import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { SCHEMA_UPDATED_EVENT, SchemaUpdatedPayload, onSchemaUpdated } from './schema-sync.hub';

interface SubParams {
  building_id?: string;
  subsystem?: string;
  device_ids?: string[];
}

@WebSocketGateway({ namespace: '/api/v1/ws/live', cors: { origin: '*', credentials: true } })
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('LiveGateway');
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly subs = new Map<string, SubParams>();

  constructor(
    @Inject(CONNECTOR_TOKEN) private readonly connector: Connector,
    private readonly config: ConfigService,
  ) {}

  handleConnection(client: Socket): void {
    this.logger.log(`client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    const t = this.timers.get(client.id);
    if (t) clearInterval(t);
    this.timers.delete(client.id);
    this.subs.delete(client.id);
    this.logger.log(`client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  onSubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: SubParams): void {
    const params: SubParams = {
      building_id: body?.building_id,
      subsystem: body?.subsystem,
      device_ids: Array.isArray(body?.device_ids) ? body.device_ids : [],
    };
    this.subs.set(client.id, params);

    const existing = this.timers.get(client.id);
    if (existing) clearInterval(existing);
    const interval = Number(this.config.get('WS_PUSH_INTERVAL_MS', '2000'));
    const timer = setInterval(() => this.push(client), interval);
    this.timers.set(client.id, timer);

    this.push(client);
    client.emit('subscribed', { ok: true, params });
  }

  private async push(client: Socket): Promise<void> {
    const params = this.subs.get(client.id);
    if (!params) return;
    try {
      const batch = await this.connector.read('live_batch', {
        building_id: params.building_id,
        subsystem: params.subsystem,
        device_ids: params.device_ids,
      });
      const data = (batch[0] as any) || { metrics: [], alarms: [] };
      client.emit('metrics', data.metrics);
      if (data.alarms && data.alarms.length) {
        client.emit('alarms', data.alarms);
      }
    } catch (e) {
      this.logger.warn(`live push error: ${(e as Error).message}`);
    }
  }
}
