// The application: the one place that imports every design module and tool and registers them
// (plan §1.2 rule 6), then creates the shell.
import { Shell } from './shell/controller';
import { DesignRegistry, type DesignModule } from './designs/module';
import { functionDesign } from './designs/function';
import { scheduleDesign } from './designs/schedule';
import { sequenceDesign } from './designs/sequence';

export function createRegistry(): DesignRegistry {
  const r = new DesignRegistry();
  r.register(functionDesign as unknown as DesignModule);
  r.register(scheduleDesign as unknown as DesignModule);
  r.register(sequenceDesign as unknown as DesignModule);
  return r;
}

export function createApp(): Shell {
  return new Shell(createRegistry());
}
