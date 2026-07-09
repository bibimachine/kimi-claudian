import { QueryBackedInlineEditService } from '../../../core/auxiliary/QueryBackedInlineEditService';
import type ClaudianPlugin from '../../../main';
import { KimiAuxQueryRunner } from '../runtime/KimiAuxQueryRunner';

export class KimiInlineEditService extends QueryBackedInlineEditService {
  constructor(plugin: ClaudianPlugin) {
    super(new KimiAuxQueryRunner(plugin));
  }
}
