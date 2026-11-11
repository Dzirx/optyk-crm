import { NextRequest, NextResponse } from 'next/server';
import { runScheduledSms } from '@/lib/sms/scheduled';

/**
 * Ręczne uruchomienie wysyłki zaplanowanych SMS-ów (przypomnienia i prośby o opinię).
 * W chmurze wysyłkę co 5 minut robi wbudowany harmonogram (instrumentation.ts),
 * w wersji Windows licznik w desktop/src/backend.js. Wymaga nagłówka Authorization: Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('CRON_SECRET not configured');
      return NextResponse.json({ error: 'Usługa cron nie jest skonfigurowana' }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.warn('Unauthorized cron attempt');
      return NextResponse.json({ error: 'Nieautoryzowany' }, { status: 401 });
    }

    const { timestamp, results } = await runScheduledSms();
    return NextResponse.json({ message: 'Scheduled SMS job completed', timestamp, results });
  } catch (error) {
    console.error('[CRON] Fatal error:', error);
    return NextResponse.json(
      { error: 'Nie udało się przetworzyć zaplanowanego SMS' },
      { status: 500 }
    );
  }
}
