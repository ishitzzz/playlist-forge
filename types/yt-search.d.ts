declare module "yt-search" {
    interface VideoResult {
        videoId: string;
        title: string;
        description?: string;
        url: string;
        duration?: {
            seconds: number;
            timestamp: string;
        };
        views?: number;
        author?: {
            name?: string;
            url?: string;
        };
    }

    interface PlaylistResult {
        listId: string;
        title: string;
        url: string;
        author?: {
            name?: string;
            url?: string;
        };
        videoCount?: number;
    }

    interface PlaylistDetailResult {
        videos: VideoResult[];
    }

    interface SearchResult {
        videos: VideoResult[];
        playlists: PlaylistResult[];
    }

    function ytSearch(query: string): Promise<SearchResult>;
    function ytSearch(query: { listId: string }): Promise<PlaylistDetailResult>;
    function ytSearch(query: string | { listId: string }): Promise<SearchResult | PlaylistDetailResult>;

    export default ytSearch;
}
