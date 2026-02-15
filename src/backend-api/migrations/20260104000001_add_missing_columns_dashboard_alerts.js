/**
 * Migration: Add missing columns to dashboard_alerts table
 * Date: 2026-01-04
 */
exports.up = async function (knex) {
  // Check if columns exist before adding them
  const hasType = await knex.schema.hasColumn('dashboard_alerts', 'type');
  const hasIsRead = await knex.schema.hasColumn('dashboard_alerts', 'is_read');
  const hasTitle = await knex.schema.hasColumn('dashboard_alerts', 'title');
  const hasDetails = await knex.schema.hasColumn('dashboard_alerts', 'details');
  const hasRelatedTaskId = await knex.schema.hasColumn('dashboard_alerts', 'related_task_id');

  return knex.schema.alterTable('dashboard_alerts', function (table) {
    if (!hasType) table.text('type').defaultTo('warning');
    if (!hasIsRead) table.boolean('is_read').defaultTo(false);
    if (!hasTitle) table.text('title');
    if (!hasDetails) table.text('details');
    if (!hasRelatedTaskId) table.integer('related_task_id').references('id').inTable('tasks').onDelete('SET NULL');
  });
};

exports.down = function (knex) {
  return knex.schema.table('dashboard_alerts', function (table) {
    table.dropColumn('type');
    table.dropColumn('is_read');
    table.dropColumn('title');
    table.dropColumn('details');
    table.dropColumn('related_task_id');
  });
};
