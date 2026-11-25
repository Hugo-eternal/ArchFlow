// The application: the one place that imports every design module and tool and registers them
// (plan §1.2 rule 6), then creates the shell.
import { Shell } from './shell/controller';
import { DesignRegistry } from './designs/module';
import { functionDesign } from './designs/function';

export function createRegistry(): DesignRegistry {
  const r = new DesignRegistry();
  r.register(functionDesign);
  return r;
}

export function createApp(): Shell {
  return new Shell(createRegistry());
}
