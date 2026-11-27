import {handleMailRelay} from '@/lib/d1/auth-mail';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {return handleMailRelay(request,process.env);}

export async function POST(request:Request) {return handleMailRelay(request,process.env);}
