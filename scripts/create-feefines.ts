import { getRefreshableAuthenticator, url } from '@/src/socket/fqm';
import { FqmConnection } from '@/types';
import ky from 'ky';
import ProgressBar from 'progress';
import { v4 } from 'uuid';

if (process.argv.length !== 3) {
  console.error('Usage: bun scripts/create-feefines.ts <quantity>');
  process.exit(1);
}

const RUNS = parseInt(process.argv[2], 10);

const FQM_CONNECTION: FqmConnection = {
  host: process.env.FQM_HOST!,
  port: parseInt(process.env.FQM_PORT ?? '8080'),
  tenant: process.env.FQM_TENANT!,
  limit: 50,
  user: process.env.FQM_USERNAME,
  password: process.env.FQM_PASSWORD,
};

const FEE_FINE_PROPS = {
  userId: '2205005b-ca51-4a04-87fd-938eefa8f6de',
  ownerId: 'efe50307-fb2e-4d01-9cc4-31e81e67a145',
  feeFineOwner: 'owner',
  feeFineId: '45c98e95-d53f-41ff-9f35-715ef0c34920',
  feeFineType: 'type1',
  amount: '1.00',
  remaining: '1.00',
  paymentStatus: { name: 'Outstanding' },
  status: { name: 'Open' },
  callNumber: '',
};

const token = getRefreshableAuthenticator(FQM_CONNECTION);

const progressBar = new ProgressBar('created :current/:total [:bar] (:percent%) at :rate/s :etas', {
  total: RUNS,
});
for (let i = 0; i < RUNS; i++) {
  await ky.post(`${url(FQM_CONNECTION)}/accounts`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Okapi-Tenant': FQM_CONNECTION.tenant,
      Cookie: `folioAccessToken=${await token()}`,
    },
    json: {
      ...FEE_FINE_PROPS,
      id: v4(),
    },
  });
  progressBar.tick();
}
