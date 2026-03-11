import { NextResponse } from 'next/server';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { walletsRepo, vault } from '../../db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { alias, walletType, lowBalanceThreshold } = body;

    if (!alias?.trim()) {
      return NextResponse.json({ error: 'El alias es obligatorio' }, { status: 400 });
    }

    if (!process.env.VAULT_PASSWORD) {
      return NextResponse.json(
        { error: 'VAULT_PASSWORD no configurado en el servidor' },
        { status: 500 },
      );
    }

    // Generate new keypair
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    // Store private key in vault
    vault.setKey(alias, privateKey);

    // Create wallet record in DB
    const wallet = walletsRepo.create({
      alias,
      address: account.address,
      walletType: walletType || 'protection',
      lowBalanceThreshold: lowBalanceThreshold || '100',
    });

    return NextResponse.json(
      { ...wallet, generated: true, address: account.address },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al generar wallet';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
