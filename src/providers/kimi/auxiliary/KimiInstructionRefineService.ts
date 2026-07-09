import { QueryBackedInstructionRefineService } from '../../../core/auxiliary/QueryBackedInstructionRefineService';
import type ClaudianPlugin from '../../../main';
import { KimiAuxQueryRunner } from '../runtime/KimiAuxQueryRunner';

export class KimiInstructionRefineService extends QueryBackedInstructionRefineService {
  constructor(plugin: ClaudianPlugin) {
    super(new KimiAuxQueryRunner(plugin));
  }
}
