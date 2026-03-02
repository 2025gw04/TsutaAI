const knex = require('knex')({
    client: 'better-sqlite3',
    connection: {
        filename: '../database/tsutaai.db'
    },
    useNullAsDefault: true
});

async function check() {
    try {
        const projects = await knex('projects').select('id', 'name');
        console.log('Projects:', JSON.stringify(projects, null, 2));

        for (const p of projects) {
            const members = await knex('project_members as pm')
                .join('users as u', 'pm.user_id', 'u.id')
                .where('pm.project_id', p.id)
                .select('pm.id as pm_id', 'u.id as user_id', 'u.username', 'pm.role');
            console.log(`Members for Project ${p.id} (${p.name}):`, JSON.stringify(members, null, 2));
        }
    } catch (err) {
        console.error(err);
    } finally {
        await knex.destroy();
    }
}

check();
