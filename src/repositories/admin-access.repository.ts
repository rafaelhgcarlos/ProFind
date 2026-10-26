import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'

import { getFirebaseFirestore } from '../lib/firebase'

export interface AdminAccessDocument {
  active: boolean
  schemaVersion: number
}

export const adminAccessRepository = {
  observeByUserId(
    userId: string,
    onValue: (access: AdminAccessDocument | null) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return onSnapshot(
      doc(getFirebaseFirestore(), 'adminAccess', userId),
      (snapshot) => {
        if (!snapshot.exists()) {
          onValue(null)
          return
        }

        const data = snapshot.data()
        onValue({
          active: data.active === true,
          schemaVersion:
            typeof data.schemaVersion === 'number' ? data.schemaVersion : 0,
        })
      },
      onError,
    )
  },
}
