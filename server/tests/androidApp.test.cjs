const test = require('node:test');
const assert = require('node:assert/strict');
const mod = import('../lib/androidApp.js');
const FP = 'AB:'.repeat(31) + 'CD';

test('assetlinks: JSON colado do PWABuilder, variáveis separadas, e vazio quando não configurado', async () => {
  const { androidAssetLinks } = await mod;
  const pwab = JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.kira.app', sha256_cert_fingerprints: [FP] } }]);
  assert.equal(androidAssetLinks({ ANDROID_ASSETLINKS_JSON: pwab })[0].target.package_name, 'com.kira.app');
  const built = androidAssetLinks({ ANDROID_PACKAGE_NAME: 'com.kira.app', ANDROID_SHA256_FINGERPRINTS: `${FP.toLowerCase()}, invalido` });
  assert.deepEqual(built[0].target.sha256_cert_fingerprints, [FP]);
  assert.deepEqual(androidAssetLinks({}), []);
  assert.deepEqual(androidAssetLinks({ ANDROID_ASSETLINKS_JSON: '{quebrado', ANDROID_PACKAGE_NAME: 'kira' }), []);
});
