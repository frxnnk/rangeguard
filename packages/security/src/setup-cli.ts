import { input, select, confirm, password } from '@inquirer/prompts';
import { Vault } from './vault.js';
import { homedir } from 'os';
import { join } from 'path';

const DEFAULT_VAULT_PATH = join(homedir(), '.rangeguard', 'vault.enc');

async function main() {
  console.log('\n=== RangeGuard Key Manager ===\n');

  const vaultPath = await input({
    message: 'Vault path:',
    default: process.env.VAULT_PATH || DEFAULT_VAULT_PATH,
  });

  const masterPassword = await password({
    message: 'Master password:',
    mask: '*',
  });

  if (!masterPassword) {
    console.error('Password is required');
    process.exit(1);
  }

  const vault = new Vault(masterPassword, vaultPath);

  while (true) {
    const action = await select({
      message: 'What do you want to do?',
      choices: [
        { name: 'List wallets', value: 'list' },
        { name: 'Add wallet', value: 'add' },
        { name: 'Remove wallet', value: 'remove' },
        { name: 'Exit', value: 'exit' },
      ],
    });

    switch (action) {
      case 'list': {
        const aliases = vault.listAliases();
        if (aliases.length === 0) {
          console.log('\nNo wallets stored.\n');
        } else {
          console.log('\nStored wallets:');
          for (const alias of aliases) {
            console.log(`  - ${alias}`);
          }
          console.log();
        }
        break;
      }

      case 'add': {
        const alias = await input({
          message: 'Wallet alias (e.g. pool-eth-arb, profit-global):',
        });
        const privateKey = await password({
          message: 'Private key (hex):',
          mask: '*',
        });

        if (!alias || !privateKey) {
          console.log('Alias and private key are required');
          break;
        }

        vault.setKey(alias, privateKey);
        console.log(`\nWallet "${alias}" saved.\n`);
        break;
      }

      case 'remove': {
        const aliases = vault.listAliases();
        if (aliases.length === 0) {
          console.log('\nNo wallets to remove.\n');
          break;
        }

        const aliasToRemove = await select({
          message: 'Select wallet to remove:',
          choices: aliases.map((a) => ({ name: a, value: a })),
        });

        const confirmed = await confirm({
          message: `Remove "${aliasToRemove}"?`,
          default: false,
        });

        if (confirmed) {
          vault.removeKey(aliasToRemove);
          console.log(`\nWallet "${aliasToRemove}" removed.\n`);
        }
        break;
      }

      case 'exit':
        console.log('Bye!');
        process.exit(0);
    }
  }
}

main().catch(console.error);
