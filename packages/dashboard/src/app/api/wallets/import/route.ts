import { NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { walletsRepo, vault } from '../../db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { alias, privateKey, walletType, lowBalanceThreshold } = body;

    if (!alias?.trim()) {
      return NextResponse.json({ error: 'El alias es obligatorio' }, { status: 400 });
    }
    if (!privateKey?.trim()) {
      return NextResponse.json({ error: 'La clave privada es obligatoria' }, { status: 400 });
    }

    if (!process.env.VAULT_PASSWORD) {
      return NextResponse.json(
        { error: 'VAULT_PASSWORD no configurado en el servidor' },
        { status: 500 },
      );
    }

    // Normalize private key (add 0x prefix if missing)
    const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

    // Derive address from private key (validates key format)
    let address: string;
    try {
      const account = privateKeyToAccount(normalizedKey as `0x${string}`);
      address = account.address;
    } catch {
      return NextResponse.json(
        { error: 'Clave privada inválida. Debe ser un hex de 64 caracteres.' },
        { status: 400 },
      );
    }

    // Store private key in vault
    vault.setKey(alias, normalizedKey);

    // Create wallet record in DB
    const wallet = walletsRepo.create({
      alias,
      address,
      walletType: walletType || 'protection',
      lowBalanceThreshold: lowBalanceThreshold || '100',
    });

    return NextResponse.json(wallet, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al importar wallet';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
