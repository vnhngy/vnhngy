import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { startRadio } from '../../audio/engine';
import { Collection } from '../../components/Collection';
import { EmptyState } from '../../components/ui';
import { downloadTracks } from '../../lib/actions';
import { audius } from '../../lib/audius';
import { formatCount } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { useLibrary } from '../../store/library';
import { toast } from '../../store/ui';

export default function ArtistScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = decodeURIComponent(rawId ?? '');
  const isLocal = id.startsWith('local:');
  const localName = isLocal ? id.slice(6) : '';

  const artist = useAsync(isLocal ? null : `artist:${id}`, () => audius.artist(id));
  const tracks = useAsync(isLocal ? null : `artist-tracks:${id}`, () => audius.artistTracks(id));
  const allTracks = useLibrary((s) => s.tracks);
  const following = useLibrary((s) => s.followedArtists.some((a) => a.id === id));
  const toggleFollow = useLibrary((s) => s.toggleFollowArtist);
  const pushRecent = useLibrary((s) => s.pushRecent);

  const localTracks = useMemo(
    () => (isLocal ? Object.values(allTracks).filter((tr) => tr.artist === localName) : []),
    [isLocal, allTracks, localName],
  );

  const name = isLocal ? localName : artist.data?.name ?? '';

  useEffect(() => {
    if (name) pushRecent({ kind: 'artist', id, name, artwork: artist.data?.picture });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const list = isLocal ? localTracks : tracks.data ?? [];

  if (!isLocal && artist.error && !artist.data) {
    return <EmptyState icon="cloud-offline-outline" title="Künstler konnte nicht geladen werden" text={artist.error} />;
  }

  return (
    <Collection
      title={name || 'Künstler'}
      subtitle={isLocal ? 'Auf dem Gerät' : artist.data ? `${formatCount(artist.data.followers)} Follower${artist.data.verified ? ' · Verifiziert ✓' : ''}` : undefined}
      description={artist.data?.bio}
      seed={id}
      artwork={artist.data?.picture}
      round
      icon="person"
      tracks={list}
      loading={!isLocal && tracks.loading}
      error={tracks.error}
      onRefresh={isLocal ? undefined : tracks.reload}
      context={{ type: 'artist', id, name: name || 'Künstler' }}
      actions={[
        ...(isLocal || !artist.data
          ? []
          : [
              {
                icon: following ? ('person-remove-outline' as const) : ('person-add-outline' as const),
                label: following ? 'Entfolgen' : 'Folgen',
                active: following,
                onPress: () => artist.data && toast(toggleFollow(artist.data) ? `Du folgst ${artist.data.name}` : 'Nicht mehr gefolgt'),
              },
              { icon: 'arrow-down-circle-outline' as const, label: 'Alle herunterladen', onPress: () => downloadTracks(list) },
            ]),
        ...(list[0] ? [{ icon: 'radio-outline' as const, label: 'Künstler-Radio', onPress: () => startRadio(list[0]).catch(() => toast('Radio nicht verfügbar')) }] : []),
      ]}
      empty={<EmptyState icon="musical-notes-outline" title="Keine Songs" />}
    />
  );
}
