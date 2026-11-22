import { SERVER, setUpOwner } from './server';

// Once a run, after the servers are up: the empty server gets its owner, whose key the tests use
// to open spaces and give invites.
export default async function globalSetup() {
  for (let tries = 0; ; tries++) {
    try {
      const server = (await (await fetch(`${SERVER}/api/v1/server`)).json()) as { new: boolean };
      if (!server.new) throw new Error('The test server is not new: was its folder kept?');
      break;
    } catch (error) {
      if (tries === 50) throw error;
      await new Promise((done) => setTimeout(done, 200));
    }
  }
  process.env.E2E_OWNER_TOKEN = await setUpOwner();
}
