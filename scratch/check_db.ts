
import { db } from '../src/shared/db';
import { projects, users } from '../src/shared/db/schemas';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function checkData() {
  console.log('--- Checking Users ---');
  const allUsers = await db.select().from(users);
  console.log(`Found ${allUsers.length} users.`);
  allUsers.forEach(u => console.log(`User ID: ${u.id}, Email: ${u.email}`));

  console.log('\n--- Checking Projects ---');
  const allProjects = await db.select().from(projects);
  console.log(`Found ${allProjects.length} projects.`);
  allProjects.forEach(p => console.log(`Project ID: ${p.id}, Owner ID: ${p.ownerId}, Name: ${p.name}`));
}

checkData().catch(console.error);
