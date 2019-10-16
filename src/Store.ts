import {
  runInAction,
  action,
  configure,
  observable,
  IObservableArray,
  ObservableMap
} from 'mobx'
import { Textile, FileIndex } from '@textile/js-http-client'
import { Group, Post } from './domain'

configure({ enforceActions: 'always' })

async function getBlobContent(serialized: Blob): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = function() {
      resolve(reader.result as string)
    }
    reader.readAsText(serialized)
  })
}

const SCHEMA = {
  name: 'permaweb-v0.0.3',
  mill: '/json',
  // eslint-disable-next-line @typescript-eslint/camelcase
  json_schema: {
    definitions: {},
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'http://example.com/root.json',
    type: 'object',
    required: ['content'],
    properties: {
      content: { type: 'string' }
    }
  }
}

const textile = new Textile({
  url: 'http://127.0.0.1',
  port: 40600
})

class Store {
  gateway: string = 'http://127.0.0.1:5052'
  schema: FileIndex | undefined = undefined
  @observable status: string = 'offline'
  @observable groups: IObservableArray<Group> = [] as any
  @observable currentPosts: IObservableArray<Post> = [] as any

  @action
  async connect() {
    const schema = await textile.schemas.add(SCHEMA)
    // todo update this to profileGet as init
    runInAction(() => {
      this.schema = schema
      this.status = 'online'
    })
  }

  /* groups */
  @action
  async groupsGetAll() {
    const { items } = await textile.threads.list()

    const groups = items.map(({ id, name }) => ({
      groupHash: id,
      name
    }))

    runInAction(() => {
      this.groups.replace(groups)
    })

    return groups
  }

  @action
  async groupsAdd(name: string) {
    if (!this.schema) {
      throw new Error('Schema not loaded')
    }

    const group = await textile.threads.add(
      name,
      this.schema.hash,
      undefined,
      'open',
      'invite_only'
    )
    this.groupsGetAll()
    return group
  }

  @action
  groupsDelete = async (groupHash: string) => {
    const res = await textile.threads.remove(groupHash)
    this.groupsGetAll()
    return res
  }

  async groupsInvite(groupHash: string) {
    return textile.invites.addExternal(groupHash)
  }

  async groupsJoin({ id, key }: any) {
    const res = textile.invites.accept(id, key)
    console.log(res)
  }

  /* posts */
  @action
  async postsLoad(groupHash: string) {
    const { items } = await textile.files.list(groupHash)

    const posts: Post[] = await Promise.all(
      items.map(async ({ block, files: [{ file: { hash, added } }] }) => {
        const blob = await textile.file.content(hash)
        const serialized = await getBlobContent(blob)
        const { content } = JSON.parse(serialized)
        // content was also serialized
        const data = JSON.parse(content)

        return {
          groupHash,
          postHash: hash,
          block,
          lastModified: added,
          author: 'Error',
          content: data,
          comments: [],
          shares: [],
          reactions: []
        }
      })
    )

    runInAction(() => {
      this.currentPosts.replace(posts)
    })

    return posts
  }

  @action
  async postsAdd(groupHash: string, content: {}) {
    try {
      const payload = { content: JSON.stringify(content) }
      await textile.files.add(payload, '', groupHash)
      runInAction(() => {
        this.postsLoad(groupHash)
      })
      return true
    } catch (err) {
      console.log('Error adding post: ', err)
    }
    return false
  }

  @action
  async postsDelete(block: string) {
    const res = await textile.files.ignore(block)
    return res
  }

  /* interactions */
  async reactionsGetAll(groupHash: string, postHash: string) {}

  async reactionsAdd(groupHash: string, postHash: string, reaction: string) {}

  async reactionsRemove(groupHash: string, postHash: string, reaction: string) {}
}

export default Store
