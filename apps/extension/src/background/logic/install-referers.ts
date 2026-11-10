import { createRule } from './create-rule';
import { installRules } from './install-rules';

const referrersInstalled = new Set<string>();

const NOOP = () => {};

export function installReferrer(name: string, value: string) {
  if (referrersInstalled.has(name)) return NOOP;
  referrersInstalled.add(name);

  return installRules(createRule(name, value));
}
export function installReferrers(referers: Record<string, string>) {
  const rules = Object.entries(referers).reduce((rules, [name, value]) => {
    rules.push(...createRule(name, value));
    return rules;
  }, [] as chrome.declarativeNetRequest.Rule[]);

  if (__DEV__) console.log(rules);
  return installRules(rules);
}
