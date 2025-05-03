import {  type ServiceProxy } from '.';

async function fetchActivities(Lobby: ServiceProxy<'Lobby'>) {
  const { activity_list } = await Lobby.fetchInfo();
  const amulet = activity_list?.activities?.find(
    (activity) => activity.type === 'amulet'
  );
  const sim_v2 = activity_list?.activities?.find(
    (activity) => activity.type === 'sim_v2'
  );

  return { amulet, sim_v2 };
}

async function simulation(Lobby: ServiceProxy<'Lobby'>, activity_id: number) {
  await Lobby.taskRequest({ params: [activity_id]});
}

async function amulet(Lobby: ServiceProxy<'Lobby'>, activity_id: number) {
  await Lobby.taskRequest({ params: [activity_id]});
  
  await Lobby.completePeriodActivityTask({
    task_id: 25011208,
  });
}
