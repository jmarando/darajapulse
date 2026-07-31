SELECT cron.alter_job(3, schedule => '0 */6 * * *');
SELECT cron.alter_job(37, schedule => '30 */6 * * *');
SELECT cron.alter_job(1, schedule => '15 */6 * * *');
SELECT cron.alter_job(11, schedule => '45 */6 * * *');
SELECT cron.alter_job(9, schedule => '7 */6 * * *');