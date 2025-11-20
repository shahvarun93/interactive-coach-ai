import * as sdResourcesDao from '../dao/sd-resources.dao';
import { SDResource } from '../interfaces/SDResource';

export async function findResourcesForTopic(
  topic: string | null,
  limit = 5
): Promise<SDResource[]> {
  return sdResourcesDao.findResourcesByTopic(topic ?? '', limit);
}

