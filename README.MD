{
  "_id": {
    "$oid": "685449832c37714911b0c9ce"
  },
  "email": "juluri.saichandu99@gmail.com",
  "splitwise_name": "Saichandu",
  "groups": [
    "53885029",
    "75628383"
  ],
  "is_active": true,
  "created_at": "2025-06-15T10:30:00.000Z",
  "updated_at": "2025-06-15T10:30:00.000Z"
}



sudo mongod --dbpath ~/data/db


# need to change
- for individual approval, we need to save in splitwise then in the mongodb just like in the batch in the approve-update api
- when someone changes split in the ui of splitwise, we also need to update the mongodb which we cannot do. so maybe at some time when someone logins or when admin clicks a button for now, we need to check the splits in mongodb with the splits in the ui and then change the splits properly
