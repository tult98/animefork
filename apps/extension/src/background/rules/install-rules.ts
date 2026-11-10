export async function installRules(rules: chrome.declarativeNetRequest.Rule[]) {
  const ruleIds = rules.map((item) => item.id);

  const uninstall = () =>
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ruleIds,
    });
  await uninstall();
  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: rules,
  });

  return uninstall;
}
