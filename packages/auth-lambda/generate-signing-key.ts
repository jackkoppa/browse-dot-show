import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateSigningKeyPair } from '@browse-dot-show/auth';

/**
 * Generates the session-token signing key pair: `pnpm --filter @browse-dot-show/auth-lambda generate-signing-key`
 *
 * Writes the private key to a file only you can read (to put in SSM; see terraform/auth/README.md)
 * and prints the public key (for subscriber sites' prod.tfvars). Never commit the private key.
 */
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bds-signing-key-'));
const privateKeyPath = path.join(directory, 'signing-private-key.pem');
const { privateKeyPem, publicKeyPem } = generateSigningKeyPair();
fs.writeFileSync(privateKeyPath, privateKeyPem, { mode: 0o600 });

console.log(`Private key (put it in SSM, then delete the file): ${privateKeyPath}\n`);
console.log('Public key (subscriber_token_public_key in subscriber sites\' prod.tfvars):\n');
console.log(publicKeyPem);
