# Setting up

To run the backend, you must set the following environment variables:

- `PORT`: This is the port number on which your server will run. For example, if you set `PORT=8080`, your server will start on `http://localhost:8080`.

- `JWT_SECRET`: This is the secret key used to sign and verify JSON Web Tokens for user authentication. It should be a long, random and secure string.

- `GOOGLE_CREDS`: This is a JSON string that contains your Google credentials. It includes the `type` of user, `client_id`, `client_secret`, and `refresh_token`. These are used for Google OAuth authentication.

- `MONGO_URI`: This is the connection string for your MongoDB database. It should include the username, password, and the address of your MongoDB server. In this case, it connects to a MongoDB Atlas cluster.



