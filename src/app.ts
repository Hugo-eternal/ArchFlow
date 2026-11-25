// The application: the one place that creates the shell and (from step 3.24) registers every
// design module and tool (plan §1.2 rule 6).
import { Shell } from './shell/controller';

export function createApp(): Shell {
  return new Shell();
}
