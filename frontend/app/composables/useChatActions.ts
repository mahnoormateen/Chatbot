import ModalConfirm from '~/components/ModalConfirm.vue'
import ModalRename from '~/components/ModalRename.vue'

export function useChatActions() {
  const route = useRoute()
  const toast = useToast()
  const overlay = useOverlay()

  const { deleteConversation, renameConversation, conversations } = useChat()

  const renameModal = overlay.create(ModalRename)
  const deleteModal = overlay.create(ModalConfirm, {
    props: {
      title: 'Delete conversation',
      description: 'Are you sure you want to delete this conversation? This cannot be undone.',
      color: 'error'
    }
  })

  async function renameChat(id: number, currentTitle?: string | null): Promise<string | null> {
    const instance = renameModal.open({ title: currentTitle ?? '' })
    const result = await instance.result

    if (!result || result === currentTitle) return null

    try {
      await renameConversation(id, result)

      const target = conversations.value.find(c => c.id === id)
      if (target) {
        target.title = result
      }

      return result
    } catch {
      toast.add({
        description: 'Failed to rename conversation',
        icon: 'i-lucide-alert-circle',
        color: 'error'
      })

      return null
    }
  }

  async function deleteChat(id: number): Promise<boolean> {
    const instance = deleteModal.open()
    const result = await instance.result

    if (!result) return false

    try {
      await deleteConversation(id)

      toast.add({
        title: 'Conversation deleted',
        description: 'The conversation has been deleted',
        icon: 'i-lucide-trash'
      })

      return true
    } catch {
      toast.add({
        description: 'Failed to delete conversation',
        icon: 'i-lucide-alert-circle',
        color: 'error'
      })

      return false
    }
  }

  return {
    renameChat,
    deleteChat
  }
}
