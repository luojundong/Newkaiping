import { Inject, Injectable } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';

@Injectable()
export class EnergyService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  async summary(buildingId: string | undefined, period: string | undefined): Promise<any> {
    const r = await this.connector.read('energy_summary', { building_id: buildingId, period: period || 'day' });
    return r[0];
  }

  async trend(
    buildingId: string | undefined,
    subsystem: string | undefined,
    from: string | undefined,
    to: string | undefined,
  ): Promise<any> {
    const r = await this.connector.read('energy_trend', { building_id: buildingId, subsystem, from, to });
    return r[0];
  }
}
